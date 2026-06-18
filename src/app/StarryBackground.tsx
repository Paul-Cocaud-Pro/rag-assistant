"use client";
import { useEffect, useRef } from "react";

export default function StarryBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    type Star = { x: number; y: number; r: number; base: number; amp: number; speed: number; phase: number };
    let stars: Star[] = [];

    type Shooting = { x: number; y: number; vx: number; vy: number; life: number; len: number };
    const shooting: Shooting[] = [];

    // (Re)génère le canvas et les étoiles à la bonne taille
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.floor((width * height) / 8000); // densité ∝ surface
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 0.8 + 0.2,
        base: Math.random() * 0.5 + 0.3,   // luminosité moyenne
        amp: Math.random() * 0.4 + 0.1,    // amplitude du scintillement
        speed: Math.random() * 0.0015 + 0.0005,
        phase: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    // Étoile filante occasionnelle
    const timer = setInterval(() => {
      if (Math.random() < 0.6) {
        shooting.push({
          x: Math.random() * width,
          y: -20,
          vx: -(Math.random() * 3 + 4),
          vy: Math.random() * 3 + 4,
          life: 1,
          len: Math.random() * 80 + 80,
        });
      }
    }, 3000);

    let raf = 0;
    const render = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      // Étoiles scintillantes : l'opacité oscille via un sinus
      for (const s of stars) {
        const a = s.base + s.amp * Math.sin(t * s.speed + s.phase);
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Étoiles filantes : traînée en dégradé
      for (let i = shooting.length - 1; i >= 0; i--) {
        const sh = shooting[i];
        const tx = sh.x - sh.vx * (sh.len / 8);
        const ty = sh.y - sh.vy * (sh.len / 8);
        const grad = ctx.createLinearGradient(sh.x, sh.y, tx, ty);
        grad.addColorStop(0, `rgba(255,255,255,${sh.life})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        sh.x += sh.vx;
        sh.y += sh.vy;
        sh.life -= 0.012;
        if (sh.life <= 0 || sh.y > height + 40 || sh.x < -40) shooting.splice(i, 1);
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    // Nettoyage à la destruction du composant
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
}