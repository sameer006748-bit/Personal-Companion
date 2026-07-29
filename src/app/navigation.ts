import {
  Activity,
  CalendarRange,
  House,
  MessageCircle,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

export interface NavigationItem {
  to: string
  label: string
  icon: LucideIcon
  end: boolean
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/activity', label: 'Activity', icon: Activity, end: false },
  {
    to: '/assistant',
    label: 'Assistant',
    icon: MessageCircle,
    end: false,
  },
  {
    to: '/planning',
    label: 'Planning',
    icon: CalendarRange,
    end: false,
  },
  { to: '/profile', label: 'Profile', icon: UserRound, end: false },
]

export function getActiveNavigationIndex(pathname: string): number {
  const activeIndex = NAVIGATION_ITEMS.findIndex((item) =>
    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to),
  )

  return activeIndex === -1 ? 0 : activeIndex
}
