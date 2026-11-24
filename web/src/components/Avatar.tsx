import { avatarUrl, initials } from "@/lib/format";

// A round face: the profile photo when there is one, else the initials on
// the person's colour. `label` replaces the initials (e.g. "ME").
export function Avatar({
  name,
  color,
  avatar,
  size,
  label,
  title,
}: {
  name: string;
  color: string;
  avatar?: string | null;
  size?: number;
  label?: string;
  title?: string;
}) {
  const src = avatarUrl(avatar ?? null);
  const style: React.CSSProperties = { background: color, ...(size ? { width: size, height: size } : null) };
  return (
    <span className={`avatar${src ? " has-photo" : ""}`} style={style} title={title}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- small public storage image
        <img src={src} alt="" loading="lazy" />
      ) : (
        (label ?? initials(name))
      )}
    </span>
  );
}
