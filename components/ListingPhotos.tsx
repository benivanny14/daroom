"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent
} from "react";
import Image from "next/image";

type ListingPhoto = { id: string; url: string; altText: string };

export function ListingPhotos({
  photos,
  neighborhood,
  tone,
  featured,
  variant = "compact"
}: {
  photos?: ListingPhoto[];
  neighborhood: string;
  tone: string;
  featured: boolean;
  variant?: "compact" | "full";
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const total = photos?.length ?? 0;
  const full = variant === "full";
  const activeIndex = Math.min(index, Math.max(0, total - 1));

  useEffect(() => {
    setIndex((current) => (total === 0 ? 0 : Math.min(current, total - 1)));
  }, [total]);

  const go = useCallback(
    (next: number) => {
      if (total < 1) return;
      setIndex(((next % total) + total) % total);
    },
    [total]
  );

  useEffect(() => {
    if (!full || total < 2) return;
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select") || target.isContentEditable)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(activeIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(activeIndex + 1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [full, total, activeIndex, go]);

  if (!photos?.length) {
    return (
      <div
        className={`listing-art art-${tone === "one" ? "1" : tone === "two" ? "2" : "3"}`}
        role="img"
        aria-label={`Illustration of a home in ${neighborhood}`}
      >
        <span className="art-sky" />
        <span className="art-window" />
        <span className="art-label">{featured ? "Featured" : "Listing"}</span>
      </div>
    );
  }

  const active = photos[activeIndex];

  function handleTouchStart(event: ReactTouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: ReactTouchEvent) {
    if (touchStartX.current === null || total < 2) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > 40) go(activeIndex + (delta < 0 ? 1 : -1));
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (total < 2) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(activeIndex + 1);
    }
  }

  return (
    <div
      className={`listing-gallery listing-gallery-${variant}`}
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photos of the home in ${neighborhood}`}
    >
      <figure
        className="listing-gallery-stage"
        tabIndex={0}
        onKeyDown={full ? undefined : handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          src={active.url}
          alt={active.altText}
          className="listing-photo"
          width={1200}
          height={800}
          unoptimized
          priority={full}
        />
        <span className="art-label">{featured ? "Featured" : "Listing"}</span>
        {total > 1 && (
          <>
            <span className="photo-counter" aria-live="polite">
              {index + 1} / {total}
            </span>
            <div className="photo-controls">
              <button type="button" aria-label="Previous photo" onClick={() => go(index - 1)}>
                ‹
              </button>
              <button type="button" aria-label="Next photo" onClick={() => go(index + 1)}>
                ›
              </button>
            </div>
          </>
        )}
      </figure>

      {full && total > 1 && (
        <>
          <div className="photo-dots" role="group" aria-label="Choose a photo">
            {photos.map((photo, photoIndex) => (
              <button
                key={photo.id}
                type="button"
                aria-label={`Photo ${photoIndex + 1} of ${total}`}
                aria-current={photoIndex === index}
                className={`photo-dot ${photoIndex === index ? "active" : ""}`}
                onClick={() => go(photoIndex)}
              />
            ))}
          </div>
          <p className="photo-caption">{active.altText}</p>
          <div className="photo-thumbnails" aria-label="All photos">
            {photos.map((photo, photoIndex) => (
              <button
                key={photo.id}
                type="button"
                className={`photo-thumb ${photoIndex === index ? "active" : ""}`}
                aria-label={`Show photo ${photoIndex + 1}: ${photo.altText}`}
                aria-current={photoIndex === index}
                onClick={() => go(photoIndex)}
              >
                <Image src={photo.url} alt="" width={160} height={110} unoptimized />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
