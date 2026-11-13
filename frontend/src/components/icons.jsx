// Minimal inline icon set (stroke icons, 24x24) so we don't need an icon dependency.
const Icon = ({ children, className = 'h-5 w-5', ...rest }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
)

export const BookIcon = (p) => (
  <Icon {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
    <path d="M4 5.5v16" />
    <path d="M9 8h7" />
  </Icon>
)
export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)
export const UploadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </Icon>
)
export const CloseIcon = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)
export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
  </Icon>
)
export const LockIcon = (p) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
)
export const ChevronLeftIcon = (p) => (
  <Icon {...p}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
)
export const ChevronRightIcon = (p) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
)
export const GridIcon = (p) => (
  <Icon {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1" />
    <rect x="13" y="4" width="7" height="7" rx="1" />
    <rect x="4" y="13" width="7" height="7" rx="1" />
    <rect x="13" y="13" width="7" height="7" rx="1" />
  </Icon>
)
export const ZoomInIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
  </Icon>
)
export const ZoomOutIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5M8 11h6" />
  </Icon>
)
export const ExpandIcon = (p) => (
  <Icon {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
)
export const SinglePageIcon = (p) => (
  <Icon {...p}>
    <rect x="7" y="4" width="10" height="16" rx="1.5" />
  </Icon>
)
export const DoublePageIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="8" height="14" rx="1.5" />
    <rect x="13" y="5" width="8" height="14" rx="1.5" />
  </Icon>
)
export const FitWidthIcon = (p) => (
  <Icon {...p}>
    <path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" />
  </Icon>
)
export const FitHeightIcon = (p) => (
  <Icon {...p}>
    <path d="M12 4v16M9 7l3-3 3 3M9 17l3 3 3-3" />
  </Icon>
)
export const DirectionIcon = (p) => (
  <Icon {...p}>
    <path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" />
  </Icon>
)
export const KeyboardIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </Icon>
)
export const EyeIcon = (p) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
export const EyeOffIcon = (p) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7c1.9 0 3.5.5 4.9 1.2M22 12s-3.5 7-10 7c-1.9 0-3.5-.5-4.9-1.2" />
    <path d="M6.5 6.5 3 3M17.5 17.5 21 21M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
)
export const HeartIcon = ({ filled, ...p }) => (
  <Icon {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20.5s-7-4.35-9.5-8.8C.9 8.6 2.3 5 5.8 4.3c2-.4 3.9.5 5 2.2 1.1-1.7 3-2.6 5-2.2 3.5.7 4.9 4.3 3.3 7.4C19 16.15 12 20.5 12 20.5z" />
  </Icon>
)
export const FileIcon = (p) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
)
