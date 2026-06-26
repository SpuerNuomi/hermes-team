import { defaultColorForName, profileInitial } from "./profileColors";

interface ProfileAvatarProps {
  name: string;
  color?: string | null;
  avatar?: string | null;
  size?: number;
  className?: string;
}

/**
 * Square, rounded profile avatar. Shows the uploaded image when present,
 * otherwise a solid accent-color tile with the profile's first letter.
 */
export default function ProfileAvatar({
  name,
  color,
  avatar,
  size = 40,
  className,
}: ProfileAvatarProps) {
  const background = color || defaultColorForName(name);
  const dimension = `${size}px`;
  const classes = className ? `profile-avatar ${className}` : "profile-avatar";

  if (avatar) {
    return (
      <span
        className={classes}
        style={{ width: dimension, height: dimension }}
        aria-hidden="true"
      >
        <img src={avatar} alt="" draggable={false} />
      </span>
    );
  }

  return (
    <span
      className={classes}
      style={{
        width: dimension,
        height: dimension,
        background,
        fontSize: `${Math.round(size * 0.42)}px`,
      }}
      aria-hidden="true"
    >
      {profileInitial(name)}
    </span>
  );
}
