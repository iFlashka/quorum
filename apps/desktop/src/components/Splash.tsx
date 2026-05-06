import splashLoopUrl from '@/assets/splash-loop.svg';

interface SplashProps {
  message?: string;
}

/**
 * Полноэкранный загрузочный сплеш с анимированной фирменной иконкой.
 * SMIL-анимация внутри SVG отрабатывается webview/Chromium самостоятельно —
 * на стороне React просто `<img>`.
 */
export function Splash({ message = 'Подключаемся…' }: SplashProps): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <img
        src={splashLoopUrl}
        alt=""
        aria-hidden="true"
        className="h-32 w-32 select-none drop-shadow-[0_8px_24px_rgba(15,23,42,0.45)]"
        draggable={false}
      />
      <span className="text-[14px] text-text-muted">{message}</span>
    </div>
  );
}
