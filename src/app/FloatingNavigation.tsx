import { useEffect, useRef, type CSSProperties } from 'react'
import { NavLink, useLocation } from 'react-router'

import {
  getActiveNavigationIndex,
  NAVIGATION_ITEMS,
} from './navigation'

interface NavigationStyle extends CSSProperties {
  '--indicator-shift': string
}

export function FloatingNavigation() {
  const { pathname } = useLocation()
  const activeIndex = getActiveNavigationIndex(pathname)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const previousIndexRef = useRef(activeIndex)

  useEffect(() => {
    const previousIndex = previousIndexRef.current
    previousIndexRef.current = activeIndex

    const indicator = indicatorRef.current

    if (
      !indicator ||
      previousIndex === activeIndex ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    const isVertical = window.matchMedia('(min-width: 1024px)').matches
    const isForward = activeIndex > previousIndex
    const departureScale = isVertical ? '0.9 1.12' : '1.12 0.9'
    const glideScale = isVertical ? '0.94 1.1' : '1.1 0.94'
    const arrivalScale = isVertical ? '0.98 1.03' : '1.03 0.98'
    const stretchedRadius = isVertical
      ? isForward
        ? '1.15rem 1.15rem 1.85rem 1.85rem'
        : '1.85rem 1.85rem 1.15rem 1.15rem'
      : isForward
        ? '1.15rem 1.85rem 1.85rem 1.15rem'
        : '1.85rem 1.15rem 1.15rem 1.85rem'
    const settlingRadius = isVertical
      ? isForward
        ? '1.42rem 1.42rem 1.64rem 1.64rem'
        : '1.64rem 1.64rem 1.42rem 1.42rem'
      : isForward
        ? '1.42rem 1.64rem 1.64rem 1.42rem'
        : '1.64rem 1.42rem 1.42rem 1.64rem'

    indicator.style.transformOrigin = isVertical
      ? isForward
        ? '50% 0%'
        : '50% 100%'
      : isForward
        ? '0% 50%'
        : '100% 50%'

    const animation = indicator.animate(
      [
        {
          borderRadius: '1.55rem',
          scale: '1 1',
          offset: 0,
        },
        {
          borderRadius: stretchedRadius,
          scale: departureScale,
          offset: 0.18,
        },
        {
          borderRadius: stretchedRadius,
          scale: glideScale,
          offset: 0.58,
        },
        {
          borderRadius: settlingRadius,
          scale: arrivalScale,
          offset: 0.68,
        },
        {
          borderRadius: '1.55rem',
          scale: '1 1',
          offset: 1,
        },
      ],
      {
        duration: 320,
        easing: 'cubic-bezier(0.22, 0.8, 0.22, 1)',
      },
    )

    animation.onfinish = () => {
      indicator.style.transformOrigin = 'center'
    }

    return () => {
      animation.onfinish = null
      animation.cancel()
      indicator.style.transformOrigin = 'center'
    }
  }, [activeIndex])

  const navigationStyle: NavigationStyle = {
    '--indicator-shift': `${activeIndex * 100}%`,
  }

  return (
    <nav
      aria-label="Primary"
      className="floating-navigation glass-elevated"
      style={navigationStyle}
    >
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="navigation-indicator glass-control"
      />
      <div className="navigation-items">
        {NAVIGATION_ITEMS.map((item, index) => {
          const Icon = item.icon

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-current={index === activeIndex ? 'page' : undefined}
              className={({ isActive }) =>
                [
                  'navigation-link',
                  isActive ? 'is-active' : '',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    aria-hidden="true"
                    className="navigation-icon"
                    strokeWidth={isActive ? 1.9 : 1.72}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
