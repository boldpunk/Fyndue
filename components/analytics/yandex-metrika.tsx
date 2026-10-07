"use client";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

/**
 * Yandex Metrika. Page views on client-side navigation are sent by hand
 * (the App Router doesn't reload pages). Webvisor never sees personal
 * finances: the app shell carries `ym-hide-content`, and the body
 * `ym-disable-keys`, so no typed text is recorded anywhere.
 */
export function YandexMetrika({ id }: { id: number }) {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Path only: query strings can carry filters and search text.
    window.ym?.(id, "hit", `${window.location.origin}${pathname}`, { referer: document.referrer });
  }, [id, pathname]);

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${id}', 'ym');
ym(${id}, 'init', {ssr:true, webvisor:true, clickmap:true, referrer: document.referrer, url: location.origin + location.pathname, accurateTrackBounce:true, trackLinks:true});`}
      </Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- tracking pixel for visitors without JS */}
          <img src={`https://mc.yandex.ru/watch/${id}`} style={{ position: "absolute", left: "-9999px" }} alt="" />
        </div>
      </noscript>
    </>
  );
}
