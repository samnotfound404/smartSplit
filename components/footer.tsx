"use client";

import { useEffect, useState } from "react";
import MaxWidthWrapper from "./max-width-wrapper";
import { User, Phone, Mail, Smartphone } from "lucide-react";

const Footer = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(e: any) {
      e.preventDefault();
      setDeferredPrompt(e);
    }

    function handleAppInstalled() {
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const onInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    console.log(`User choice: ${choice.outcome}`);
    setDeferredPrompt(null);
  };

  return (
    <footer className="h-[calc(100vh-64px)] relative bg-background">
      <MaxWidthWrapper className="h-full flex flex-col justify-center items-center">
        {/* Brand Name */}
        <section className="lg:text-7xl md:text-6xl text-5xl text-primary lg:mt-0 mt-36 font-bold">
          FLOW FINESSE
        </section>

        {/* Description */}
        <section className="lg:max-w-3xl mt-16 text-center lg:text-lg md:text-md text-sm max-w-xl text-muted-foreground">
          Our platform simplifies splitting bills and tracking shared expenses with friends or groups. Easily add
          expenses, and we&apos;ll handle the calculations. Stay organized and keep everyone on the same page with
          real-time updates.
        </section>

        {/* Divider */}
        <section className="w-1/2 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent mt-8" />

        {/* Contact Info */}
        <section className="mt-4 text-foreground h-16 justify-center items-center text-sm flex font-normal space-x-2">
          <User strokeWidth={1.75} className="text-sm text-foreground hidden lg:block" />
          <pre className="hidden lg:block">kenzinlawson</pre>
          <pre className="text-muted-foreground text-sm hidden lg:block">|</pre>
          <Mail strokeWidth={1.75} className="text-sm text-foreground hidden md:block" />
          <pre>kenzi.lawson@example.com</pre>
          <pre className="text-muted-foreground text-sm">|</pre>
          <Phone strokeWidth={1.75} className="text-sm text-foreground hidden md:block" />
          <pre>(+91) 9819392912</pre>
        </section>

        {/* Add to Home Screen Button (only if install prompt is available) */}
        {deferredPrompt && (
          <button
            onClick={onInstallClick}
            className="
              mt-8 flex items-center gap-2
              dark:bg-red-500 bg-green-500
              text-white font-medium
              px-6 py-3 rounded-md
              shadow-lg hover:ring-2 hover:ring-offset-2
              hover:ring-offset-background hover:ring-primary
              focus:outline-none focus:ring-2 focus:ring-offset-2
              focus:ring-offset-background focus:ring-primary
              active:scale-95
              active:shadow-none
              transition-transform
              transition-colors duration-200
            "
            aria-label="Add to Home Screen"
          >
            <Smartphone className="h-5 w-5" />
            <span className="hidden sm:inline">Install App</span>
          </button>
        )}
      </MaxWidthWrapper>
    </footer>
  );
};

export default Footer;
