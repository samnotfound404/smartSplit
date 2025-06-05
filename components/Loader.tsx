"use client";

import React from "react";
import styles from "./Loader.module.css";

export default function Loader() {
  return (
    <div className={styles.loaderContainer}>
      <svg
        className={styles.pl}
        viewBox="0 0 176 160"
        width="176px"
        height="160px"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="pl-grad" x1="0" y1="0" x2="0" y2="1">
            {/* 
              We set the gradient from red (hsl(0, 90%, 55%)) at the top 
              to green (hsl(120, 90%, 55%)) at the bottom.
            */}
            <stop offset="0%" stopColor="hsl(0,90%,55%)" />
            <stop offset="30%" stopColor="hsl(0,90%,55%)" />
            <stop offset="100%" stopColor="hsl(120,90%,55%)" />
          </linearGradient>
        </defs>
        <g fill="none" strokeWidth="16" strokeLinecap="round">
          {/* Faint circular ring behind */}
          <circle
            className={styles.pl__ring}
            r="56"
            cx="88"
            cy="96"
            stroke="hsla(223,10%,10%,0.1)"
          />
          {/* Worm #1: uses the red→green gradient */}
          <path
            className={styles.pl__worm1}
            d="M144,96A56,56,0,0,1,32,96"
            stroke="url(#pl-grad)"
            strokeDasharray="43.98 307.87"
          />
          {/* Worm #2: solid red stroke */}
          <path
            className={styles.pl__worm2}
            d="M32,136V96s-.275-25.725,14-40"
            stroke="hsl(0,90%,55%)"
            strokeDasharray="0 40 0 44"
            strokeDashoffset="0.001"
            visibility="hidden"
          />
          {/* Worm #3: solid red stroke (will animate into view) */}
          <path
            className={styles.pl__worm3}
            d="M144,136V96s.275-25.725-14-40"
            stroke="hsl(0,90%,55%)"
            strokeDasharray="0 40 0 44"
            strokeDashoffset="0.001"
            visibility="hidden"
          />
        </g>
      </svg>
    </div>
  );
}
