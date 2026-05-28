import avatarSrc from "@/assets/guide-avatar.jpg";
import { motion } from "framer-motion";

type Size = "hero" | "corner";

export function GuideAvatar({ size = "corner" }: { size?: Size }) {
  const dim = size === "hero"
    ? "h-44 w-44 sm:h-48 sm:w-48"
    : "h-[60px] w-[60px] sm:h-20 sm:w-20";
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 180, damping: 22 }}
      className={`relative shrink-0 ${dim}`}
    >
      <div className="absolute inset-0 rounded-full rdp-gradient-soft" />
      <div className="absolute inset-0 rounded-full ring-1 ring-[color:var(--lavender)]/40" />
      <img
        src={avatarSrc}
        alt="Sua guia"
        width={size === "hero" ? 192 : 80}
        height={size === "hero" ? 192 : 80}
        className="relative h-full w-full rounded-full object-cover rdp-breath rdp-shadow-soft"
        loading="eager"
        decoding="async"
      />
    </motion.div>
  );
}