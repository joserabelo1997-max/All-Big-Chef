// Ícones em SVG inline. São poucos e simples — não vale arrastar uma biblioteca
// inteira (e mais um download no celular) por causa de doze traços.

import type { ReactNode } from 'react'

type Props = { className?: string }

const base = 'h-6 w-6'

function Svg({ className, children }: Props & { children: ReactNode }) {
  return (
    <svg
      className={className ?? base}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconeInicio = (p: Props) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Svg>
)

export const IconeCalculadora = (p: Props) => (
  <Svg {...p}>
    <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
    <path d="M8 7h8" />
    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
    <path d="M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01" />
    <path d="M8.5 19h.01M12 19h.01M15.5 19h.01" />
  </Svg>
)

export const IconeReceita = (p: Props) => (
  <Svg {...p}>
    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H19v16H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v4H6.5A2.5 2.5 0 0 1 4 19.5z" />
    <path d="M9 7h6M9 10.5h4" />
  </Svg>
)

export const IconeProducao = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6h3M4 12h3M4 18h3" />
    <path d="M10.5 6H20M10.5 12H20M10.5 18H20" />
    <path d="m3.2 5.4 1.1 1.2 1.9-2.2" />
  </Svg>
)

export const IconeCompras = (p: Props) => (
  <Svg {...p}>
    <path d="M2.5 3h2.2l2.3 11.5a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.3L20.5 7H6" />
    <circle cx="9.5" cy="20" r="1.4" />
    <circle cx="17.5" cy="20" r="1.4" />
  </Svg>
)

export const IconeInsumo = (p: Props) => (
  <Svg {...p}>
    <path d="M12 2.5c3.3 0 6 2.5 6 5.6 0 2.3-1.3 3.6-2.3 5-1 1.4-1.2 2.6-1.2 4.4h-5c0-1.8-.2-3-1.2-4.4C7.3 11.7 6 10.4 6 8.1 6 5 8.7 2.5 12 2.5Z" />
    <path d="M9.5 21h5" />
  </Svg>
)

export const IconeMenu = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
)

export const IconeCalendario = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
)

export const IconeConfig = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Svg>
)

export const IconeFechar = (p: Props) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const IconeTrocar = (p: Props) => (
  <Svg {...p}>
    <path d="m7 10 5-5 5 5" />
    <path d="m7 14 5 5 5-5" />
  </Svg>
)

export const IconeSair = (p: Props) => (
  <Svg {...p}>
    <path d="M15 17.5V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 20V4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 15 4v2.5" />
    <path d="M10 12h11m0 0-3.5-3.5M21 12l-3.5 3.5" />
  </Svg>
)

export const IconeMais = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconeLivro = (p: Props) => (
  <Svg {...p}>
    <path d="M12 6.5S10 4 6.5 4H3v13h3.5C10 17 12 19.5 12 19.5S14 17 17.5 17H21V4h-3.5C14 4 12 6.5 12 6.5Z" />
    <path d="M12 6.5v13" />
  </Svg>
)
