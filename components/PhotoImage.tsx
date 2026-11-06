"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/**
 * A listing photo served through the Next.js image optimizer.
 *
 * The optimizer is what keeps a phone download at 25–40 KB per card instead of
 * the full 300 KB file, but it can refuse a request (a hosting quota, an
 * expired storage URL, a source type it cannot transform). On Hobby Vercel
 * answers 402 once the monthly transformation quota is used up, which would
 * otherwise leave every uncached photo as alt text. Falling back to the plain
 * URL keeps the photo visible at its stored size.
 */
export function PhotoImage({ alt, className, priority, ...rest }: ImageProps & { alt: string }) {
  const [failed, setFailed] = useState(false);
  const src = typeof rest.src === "string" ? rest.src : "";
  const width = typeof rest.width === "number" ? rest.width : undefined;
  const height = typeof rest.height === "number" ? rest.height : undefined;

  if (failed && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    );
  }

  return (
    <Image
      {...rest}
      alt={alt}
      className={className}
      priority={priority}
      onError={() => setFailed(true)}
    />
  );
}
