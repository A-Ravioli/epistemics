import { NavLink } from 'react-router';
import type { Course } from '@epistemics/core';
import { SidebarGroup, SidebarRow, sidebarRowClass } from '@epistemics/ui';

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly meta: string;
}

export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/**
 * The left pane: the courses you are enrolled in, then the screens, grouped. Rows are names and nothing
 * else — no icons, no second line — because a sidebar's job is to be read down, not looked at.
 */
export function AppSidebar({ groups, courses, activeCourseId, onPickCourse, onNavigate, className = '', id }: {
  groups: readonly NavGroup[];
  courses: readonly Course[];
  activeCourseId?: string;
  onPickCourse: (id: string) => void;
  onNavigate?: () => void;
  className?: string;
  id?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 p-2 ${className}`} id={id}>
      {courses.length > 0 ? (
        <SidebarGroup title="Courses" testId="sidebar-courses">
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              className={sidebarRowClass(c.id === activeCourseId)}
              aria-current={c.id === activeCourseId ? 'true' : undefined}
              data-testid="course-row"
              onClick={() => {
                onPickCourse(c.id);
                onNavigate?.();
              }}
            >
              <SidebarRow label={c.title} title={c.title} />
            </button>
          ))}
        </SidebarGroup>
      ) : null}
      {groups.map((g) => (
        <SidebarGroup key={g.title} title={g.title}>
          {g.items.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={onNavigate} className={({ isActive }) => sidebarRowClass(isActive)}>
              <SidebarRow label={item.label} title={item.meta} />
            </NavLink>
          ))}
        </SidebarGroup>
      ))}
    </div>
  );
}
