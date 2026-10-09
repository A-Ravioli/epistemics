// `Array.prototype.sort` exactly as V8 runs it (third_party/v8/builtins/array-sort.tq): binary insertion
// for arrays shorter than 8, TimSort with galloping otherwise. The result of a stable sort is the same
// under any algorithm, but the *sequence of comparator calls* is not, and the queue draws its random
// tie-break keys lazily inside the comparator (queue.ts). Matching V8's call order is what keeps those
// draws, and everything downstream of the shared rng, identical to the web.

/// Sorts `array` in place with a JS-style comparator (negative: a before b). NaN counts as 0.
func jsSort<T>(_ array: inout [T], _ compare: (T, T) -> Double) {
    withoutActuallyEscaping(compare) { cmp in
        var sorter = TimSort(array, cmp)
        sorter.run()
        array = sorter.a
    }
}

/// Returns a sorted copy (`[...xs].sort(cmp)`).
func jsSorted<T>(_ array: [T], _ compare: (T, T) -> Double) -> [T] {
    var copy = array
    jsSort(&copy, compare)
    return copy
}

private enum MergeExit { case succeed, copyA, copyB }

private struct TimSort<T> {
    var a: [T]
    let cmp: (T, T) -> Double
    var minGallop = 7
    var runs: [(base: Int, len: Int)] = []
    static var minGallopWins: Int { 7 }

    init(_ a: [T], _ cmp: @escaping (T, T) -> Double) { self.a = a; self.cmp = cmp }

    @inline(__always) func c(_ x: T, _ y: T) -> Double {
        let v = cmp(x, y)
        return v.isNaN ? 0 : v
    }

    mutating func run() {
        let n = a.count
        if n < 2 { return }
        if n < 8 { binaryInsertion(0, 0, n); return }
        var remaining = n, low = 0
        let minRun = Self.minRunLength(remaining)
        while remaining != 0 {
            var cur = countAndMakeRun(low, low + remaining)
            if cur < minRun {
                let forced = min(minRun, remaining)
                binaryInsertion(low, low + cur, low + forced)
                cur = forced
            }
            runs.append((low, cur))
            mergeCollapse()
            low += cur
            remaining -= cur
        }
        while runs.count > 1 {
            var i = runs.count - 2
            if i > 0 && runs[i - 1].len < runs[i + 1].len { i -= 1 }
            mergeAt(i)
        }
    }

    static func minRunLength(_ nArg: Int) -> Int {
        var n = nArg, r = 0
        while n >= 64 { r |= n & 1; n >>= 1 }
        return n + r
    }

    mutating func countAndMakeRun(_ lowArg: Int, _ high: Int) -> Int {
        let low = lowArg + 1
        if low == high { return 1 }
        var runLength = 2
        let elementLow = a[low]
        var order = c(elementLow, a[low - 1])
        let descending = order < 0
        var previous = elementLow
        var idx = low + 1
        while idx < high {
            let current = a[idx]
            order = c(current, previous)
            if descending { if order >= 0 { break } } else { if order < 0 { break } }
            previous = current
            runLength += 1
            idx += 1
        }
        if descending { a[lowArg..<(lowArg + runLength)].reverse() }
        return runLength
    }

    mutating func binaryInsertion(_ low: Int, _ startArg: Int, _ high: Int) {
        var start = low == startArg ? startArg + 1 : startArg
        while start < high {
            var left = low, right = start
            let pivot = a[start]
            while left < right {
                let mid = left + ((right - left) >> 1)
                if c(pivot, a[mid]) < 0 { right = mid } else { left = mid + 1 }
            }
            var p = start
            while p > left { a[p] = a[p - 1]; p -= 1 }
            a[left] = pivot
            start += 1
        }
    }

    func runLen(_ i: Int) -> Int { runs[i].len }
    func invariant(_ n: Int) -> Bool { n < 2 || runLen(n - 2) > runLen(n - 1) + runLen(n) }

    mutating func mergeCollapse() {
        while runs.count > 1 {
            var n = runs.count - 2
            if !invariant(n + 1) || !invariant(n) {
                if runLen(n - 1) < runLen(n + 1) { n -= 1 }
                mergeAt(n)
            } else if runLen(n) <= runLen(n + 1) {
                mergeAt(n)
            } else {
                break
            }
        }
    }

    mutating func mergeAt(_ i: Int) {
        var (baseA, lengthA) = runs[i]
        let (baseB, lengthBInit) = runs[i + 1]
        runs[i] = (baseA, lengthA + lengthBInit)
        runs.remove(at: i + 1)
        let k = gallopRight(a, a[baseB], baseA, lengthA, 0)
        baseA += k
        lengthA -= k
        if lengthA == 0 { return }
        let lengthB = gallopLeft(a, a[baseA + lengthA - 1], baseB, lengthBInit, lengthBInit - 1)
        if lengthB == 0 { return }
        if lengthA <= lengthB { mergeLow(baseA, lengthA, baseB, lengthB) } else { mergeHigh(baseA, lengthA, baseB, lengthB) }
    }

    func gallopLeft(_ arr: [T], _ key: T, _ base: Int, _ length: Int, _ hint: Int) -> Int {
        var lastOfs = 0, offset = 1
        if c(arr[base + hint], key) < 0 {
            let maxOfs = length - hint
            while offset < maxOfs {
                if c(arr[base + hint + offset], key) >= 0 { break }
                lastOfs = offset
                offset = (offset << 1) + 1
                if offset <= 0 { offset = maxOfs }
            }
            if offset > maxOfs { offset = maxOfs }
            lastOfs += hint
            offset += hint
        } else {
            let maxOfs = hint + 1
            while offset < maxOfs {
                if c(arr[base + hint - offset], key) < 0 { break }
                lastOfs = offset
                offset = (offset << 1) + 1
                if offset <= 0 { offset = maxOfs }
            }
            if offset > maxOfs { offset = maxOfs }
            let tmp = lastOfs
            lastOfs = hint - offset
            offset = hint - tmp
        }
        lastOfs += 1
        while lastOfs < offset {
            let m = lastOfs + ((offset - lastOfs) >> 1)
            if c(arr[base + m], key) < 0 { lastOfs = m + 1 } else { offset = m }
        }
        return offset
    }

    func gallopRight(_ arr: [T], _ key: T, _ base: Int, _ length: Int, _ hint: Int) -> Int {
        var lastOfs = 0, offset = 1
        if c(key, arr[base + hint]) < 0 {
            let maxOfs = hint + 1
            while offset < maxOfs {
                if c(key, arr[base + hint - offset]) >= 0 { break }
                lastOfs = offset
                offset = (offset << 1) + 1
                if offset <= 0 { offset = maxOfs }
            }
            if offset > maxOfs { offset = maxOfs }
            let tmp = lastOfs
            lastOfs = hint - offset
            offset = hint - tmp
        } else {
            let maxOfs = length - hint
            while offset < maxOfs {
                if c(key, arr[base + hint + offset]) < 0 { break }
                lastOfs = offset
                offset = (offset << 1) + 1
                if offset <= 0 { offset = maxOfs }
            }
            if offset > maxOfs { offset = maxOfs }
            lastOfs += hint
            offset += hint
        }
        lastOfs += 1
        while lastOfs < offset {
            let m = lastOfs + ((offset - lastOfs) >> 1)
            if c(key, arr[base + m]) < 0 { offset = m } else { lastOfs = m + 1 }
        }
        return offset
    }

    mutating func mergeLow(_ baseA: Int, _ lengthAArg: Int, _ baseB: Int, _ lengthBArg: Int) {
        var lengthA = lengthAArg, lengthB = lengthBArg
        let tmp = Array(a[baseA..<(baseA + lengthA)])
        var dest = baseA, ct = 0, cb = baseB
        a[dest] = a[cb]; dest += 1; cb += 1

        func body(_ s: inout TimSort<T>) -> MergeExit {
            lengthB -= 1
            if lengthB == 0 { return .succeed }
            if lengthA == 1 { return .copyB }
            var mg = s.minGallop
            while true {
                var winsA = 0, winsB = 0
                while true {
                    if s.c(s.a[cb], tmp[ct]) < 0 {
                        s.a[dest] = s.a[cb]; dest += 1; cb += 1
                        winsB += 1; lengthB -= 1; winsA = 0
                        if lengthB == 0 { return .succeed }
                        if winsB >= mg { break }
                    } else {
                        s.a[dest] = tmp[ct]; dest += 1; ct += 1
                        winsA += 1; lengthA -= 1; winsB = 0
                        if lengthA == 1 { return .copyB }
                        if winsA >= mg { break }
                    }
                }
                mg += 1
                var first = true
                while winsA >= Self.minGallopWins || winsB >= Self.minGallopWins || first {
                    first = false
                    mg = max(1, mg - 1)
                    s.minGallop = mg
                    winsA = s.gallopRight(tmp, s.a[cb], ct, lengthA, 0)
                    if winsA > 0 {
                        for i in 0..<winsA { s.a[dest + i] = tmp[ct + i] }
                        dest += winsA; ct += winsA; lengthA -= winsA
                        if lengthA == 1 { return .copyB }
                        if lengthA == 0 { return .succeed }
                    }
                    s.a[dest] = s.a[cb]; dest += 1; cb += 1
                    lengthB -= 1
                    if lengthB == 0 { return .succeed }
                    winsB = s.gallopLeft(s.a, tmp[ct], cb, lengthB, 0)
                    if winsB > 0 {
                        for i in 0..<winsB { s.a[dest + i] = s.a[cb + i] }
                        dest += winsB; cb += winsB; lengthB -= winsB
                        if lengthB == 0 { return .succeed }
                    }
                    s.a[dest] = tmp[ct]; dest += 1; ct += 1
                    lengthA -= 1
                    if lengthA == 1 { return .copyB }
                }
                mg += 1
                s.minGallop = mg
            }
        }
        switch body(&self) {
        case .succeed:
            for i in 0..<max(0, lengthA) { a[dest + i] = tmp[ct + i] }
        case .copyB, .copyA:
            for i in 0..<lengthB { a[dest + i] = a[cb + i] }
            a[dest + lengthB] = tmp[ct]
        }
    }

    mutating func mergeHigh(_ baseA: Int, _ lengthAArg: Int, _ baseB: Int, _ lengthBArg: Int) {
        var lengthA = lengthAArg, lengthB = lengthBArg
        let tmp = Array(a[baseB..<(baseB + lengthB)])
        var dest = baseB + lengthB - 1, ct = lengthB - 1, ca = baseA + lengthA - 1
        a[dest] = a[ca]; dest -= 1; ca -= 1

        func body(_ s: inout TimSort<T>) -> MergeExit {
            lengthA -= 1
            if lengthA == 0 { return .succeed }
            if lengthB == 1 { return .copyA }
            var mg = s.minGallop
            while true {
                var winsA = 0, winsB = 0
                while true {
                    if s.c(tmp[ct], s.a[ca]) < 0 {
                        s.a[dest] = s.a[ca]; dest -= 1; ca -= 1
                        winsA += 1; lengthA -= 1; winsB = 0
                        if lengthA == 0 { return .succeed }
                        if winsA >= mg { break }
                    } else {
                        s.a[dest] = tmp[ct]; dest -= 1; ct -= 1
                        winsB += 1; lengthB -= 1; winsA = 0
                        if lengthB == 1 { return .copyA }
                        if winsB >= mg { break }
                    }
                }
                mg += 1
                var first = true
                while winsA >= Self.minGallopWins || winsB >= Self.minGallopWins || first {
                    first = false
                    mg = max(1, mg - 1)
                    s.minGallop = mg
                    var k = s.gallopRight(s.a, tmp[ct], baseA, lengthA, lengthA - 1)
                    winsA = lengthA - k
                    if winsA > 0 {
                        dest -= winsA; ca -= winsA
                        var i = winsA - 1
                        while i >= 0 { s.a[dest + 1 + i] = s.a[ca + 1 + i]; i -= 1 }
                        lengthA -= winsA
                        if lengthA == 0 { return .succeed }
                    }
                    s.a[dest] = tmp[ct]; dest -= 1; ct -= 1
                    lengthB -= 1
                    if lengthB == 1 { return .copyA }
                    k = s.gallopLeft(tmp, s.a[ca], 0, lengthB, lengthB - 1)
                    winsB = lengthB - k
                    if winsB > 0 {
                        dest -= winsB; ct -= winsB
                        for i in 0..<winsB { s.a[dest + 1 + i] = tmp[ct + 1 + i] }
                        lengthB -= winsB
                        if lengthB == 1 { return .copyA }
                        if lengthB == 0 { return .succeed }
                    }
                    s.a[dest] = s.a[ca]; dest -= 1; ca -= 1
                    lengthA -= 1
                    if lengthA == 0 { return .succeed }
                }
                mg += 1
                s.minGallop = mg
            }
        }
        switch body(&self) {
        case .succeed:
            if lengthB > 0 { for i in 0..<lengthB { a[dest - (lengthB - 1) + i] = tmp[i] } }
        case .copyA, .copyB:
            dest -= lengthA; ca -= lengthA
            var i = lengthA - 1
            while i >= 0 { a[dest + 1 + i] = a[ca + 1 + i]; i -= 1 }
            a[dest] = tmp[ct]
        }
    }
}
