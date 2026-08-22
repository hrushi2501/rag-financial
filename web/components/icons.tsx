import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const Icons = {
  logo: (props: IconProps) => <Icon {...props}><path d="M4 17.5V8.8c0-.7.4-1.4 1.1-1.7l5.8-3c.7-.3 1.5-.3 2.2 0l5.8 3c.7.3 1.1 1 1.1 1.7v8.7c0 1-.8 1.8-1.8 1.8H5.8c-1 0-1.8-.8-1.8-1.8Z" /><path d="m7.5 14 2.7-2.7 2.2 1.8 4-4" /><path d="M8 19.3v1.8M16 19.3v1.8" /></Icon>,
  files: (props: IconProps) => <Icon {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></Icon>,
  chat: (props: IconProps) => <Icon {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 9h8M8 13h5" /></Icon>,
  upload: (props: IconProps) => <Icon {...props}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" /></Icon>,
  search: (props: IconProps) => <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icon>,
  trash: (props: IconProps) => <Icon {...props}><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5" /></Icon>,
  close: (props: IconProps) => <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>,
  check: (props: IconProps) => <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>,
  arrow: (props: IconProps) => <Icon {...props}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>,
  send: (props: IconProps) => <Icon {...props}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Icon>,
  link: (props: IconProps) => <Icon {...props}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></Icon>,
  shield: (props: IconProps) => <Icon {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></Icon>,
  clock: (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
  sparkle: (props: IconProps) => <Icon {...props}><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2ZM5 15l-.7 2.3L2 18l2.3.7L5 21l.7-2.3L8 18l-2.3-.7ZM19 14l-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7Z" /></Icon>,
  database: (props: IconProps) => <Icon {...props}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Icon>,
  alert: (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></Icon>,
  refresh: (props: IconProps) => <Icon {...props}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></Icon>,
  menu: (props: IconProps) => <Icon {...props}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>,
  chevron: (props: IconProps) => <Icon {...props}><path d="m9 18 6-6-6-6" /></Icon>,
};
