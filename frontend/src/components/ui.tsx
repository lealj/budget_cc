import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { animate, motion } from 'motion/react';
import { useReducedMotionPreference } from '../lib/useReducedMotionPreference';
import { X, Activity, Minus } from 'lucide-react';
import { money } from '../lib/finance';
export function SystemLabel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`system-label ${className}`}>{children}</span>;
}
export function StatusIndicator({
  children,
  tone = 'good',
}: {
  children: ReactNode;
  tone?: 'good' | 'warning' | 'neutral';
}) {
  return (
    <span className={`status ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function TechnicalButton({
  children,
  className = '',
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost';
}) {
  return (
    <button className={`technical-button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function SectionHeader({
  index,
  title,
  action,
}: {
  index?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        {index && <span className="section-index">{index}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function CommandPanel({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.section
      id={id}
      className={`command-panel ${className}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.section>
  );
}
export function MetricDisplay({
  value,
  className = '',
  decimals = 0,
}: {
  value: number;
  className?: string;
  decimals?: number;
}) {
  // Animate a display-only value; financial calculations continue using the actual prop.
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  const reduced = useReducedMotionPreference();
  useEffect(() => {
    const control = animate(previous.current, value, {
      duration: reduced ? 0 : 0.55,
      onUpdate: setDisplay,
    });
    // Remember the last target and cancel its animation before another starts or the metric unmounts.
    previous.current = value;
    return () => control.stop();
  }, [value, reduced]);
  return <span className={`metric ${className}`}>{money(display, decimals)}</span>;
}
export function DataRow({
  label,
  value,
  className = '',
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={`data-row ${className}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
export function StaticDynamicIndicator({ value }: { value: 'static' | 'dynamic' }) {
  return (
    <span
      className={`variability ${value}`}
      title={value === 'static' ? 'Static · predictable amount' : 'Dynamic · expected allowance'}
    >
      {value === 'static' ? <Minus size={12} /> : <Activity size={12} />}
      <span>{value}</span>
    </span>
  );
}
export function CommandDrawer({
  title,
  kicker,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Native modality makes the background inert; restore the opener and scroll state on teardown.
    const dialog = ref.current;
    const active = document.activeElement as HTMLElement;
    dialog?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = old;
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`command-drawer ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        // Route Escape through parent state so React removes the drawer as well as closing it.
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        // Only the dialog surface dismisses the drawer; clicks inside its content bubble here too.
        if (e.target === e.currentTarget) close.current();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        // Explicitly wrap Tab at the ends, including browsers that otherwise move focus to chrome.
        const focusable = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      aria-labelledby="drawer-title"
    >
      <motion.div
        className="drawer-content"
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <header className="drawer-header">
          <div>
            <SystemLabel>{kicker}</SystemLabel>
            <h2 id="drawer-title">{title}</h2>
          </div>
          <button className="icon-button" aria-label="Close panel" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </motion.div>
    </dialog>
  );
}
