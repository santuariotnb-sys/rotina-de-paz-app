import { useEffect, useState } from "react";

type Props = {
  text: string;
  /** ms entre cada caractere; default 30 */
  speed?: number;
  /** mostra "digitando..." por essa quantidade de ms antes de iniciar */
  typingDelay?: number;
  onDone?: () => void;
  italic?: boolean;
  /** key extra para resetar typewriter */
  resetKey?: string | number;
};

export function SpeechBubble({
  text,
  speed = 30,
  typingDelay = 700,
  onDone,
  italic = false,
  resetKey,
}: Props) {
  const [typing, setTyping] = useState(true);
  const [output, setOutput] = useState("");

  useEffect(() => {
    setOutput("");
    setTyping(true);
    const t1 = setTimeout(() => {
      setTyping(false);
      let i = 0;
      const interval = setInterval(() => {
        i += 1;
        setOutput(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          onDone?.();
        }
      }, speed);
    }, typingDelay);
    return () => {
      clearTimeout(t1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, resetKey]);

  return (
    <div className="relative max-w-xl">
      <div
        key={`${resetKey}-${text}`}
        className="rdp-bubble-in rdp-shadow-bubble relative rounded-[20px] rounded-tl-md bg-white px-5 py-4 sm:px-6 sm:py-5"
      >
        {/* tail */}
        <span
          aria-hidden
          className="absolute -left-2 top-3 h-4 w-4 rotate-45 bg-white"
          style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
        />
        {typing ? (
          <span className="flex items-center gap-1.5 text-[color:var(--amethyst)]">
            <Dot delay={0} />
            <Dot delay={0.2} />
            <Dot delay={0.4} />
          </span>
        ) : (
          <p
            className={`font-display text-xl leading-snug text-[color:var(--deep-purple)] sm:text-[26px] ${
              italic ? "italic" : ""
            }`}
          >
            {output}
            {output.length < text.length && <span className="opacity-40">▌</span>}
          </p>
        )}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="rdp-typing-dot inline-block h-2 w-2 rounded-full bg-[color:var(--lavender)]"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}