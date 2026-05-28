import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = HTMLMotionProps<"div"> & { lift?: boolean };

export function GlassCard({ className, children, lift = true, ...rest }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.2, 0.7, 0.3, 1] }}
      whileHover={
        lift
          ? {
              y: -6,
              boxShadow:
                "0 48px 120px rgba(0,0,0,0.75), 0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,169,110,0.18), inset 0 1px 0 rgba(255,255,255,0.10)",
            }
          : undefined
      }
      className={cn("adm-glass p-5", className)}
      {...rest}
    >
      <span className="adm-shimmer" aria-hidden />
      <div className="relative z-[2]">{children as React.ReactNode}</div>
    </motion.div>
  );
}