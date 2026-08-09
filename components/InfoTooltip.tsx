import React, { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

const TOOLTIP_LAYER_Z_INDEX = 1000;
const VIEWPORT_MARGIN = 12;
const TRIGGER_GAP = 8;

interface InfoTooltipProps {
  title: string;
  content: string;
  calculation?: string;
  position?: 'top' | 'bottom';
}

interface TooltipPosition {
  left: number;
  top: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
  ready: boolean;
}

const INITIAL_POSITION: TooltipPosition = {
  left: 0,
  top: 0,
  arrowLeft: 0,
  placement: 'top',
  ready: false
};

const useFloatingTooltipPosition = <T extends HTMLElement>(
  anchorRef: React.RefObject<T | null>,
  tooltipRef: React.RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  preferredPosition: 'top' | 'bottom'
) => {
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>(INITIAL_POSITION);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const availableAbove = anchorRect.top - VIEWPORT_MARGIN;
    const availableBelow = window.innerHeight - anchorRect.bottom - VIEWPORT_MARGIN;
    const requiredHeight = tooltipRect.height + TRIGGER_GAP;

    let placement = preferredPosition;
    if (placement === 'top' && availableAbove < requiredHeight && availableBelow > availableAbove) {
      placement = 'bottom';
    } else if (placement === 'bottom' && availableBelow < requiredHeight && availableAbove > availableBelow) {
      placement = 'top';
    }

    const centeredLeft = anchorRect.left + (anchorRect.width / 2) - (tooltipRect.width / 2);
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN);
    const left = Math.min(Math.max(centeredLeft, VIEWPORT_MARGIN), maxLeft);
    const preferredTop = placement === 'top'
      ? anchorRect.top - tooltipRect.height - TRIGGER_GAP
      : anchorRect.bottom + TRIGGER_GAP;
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN);
    const top = Math.min(Math.max(preferredTop, VIEWPORT_MARGIN), maxTop);
    const anchorCenter = anchorRect.left + (anchorRect.width / 2);
    const arrowLeft = Math.min(
      Math.max(anchorCenter - left, 14),
      Math.max(14, tooltipRect.width - 14)
    );

    setTooltipPosition({ left, top, arrowLeft, placement, ready: true });
  }, [anchorRef, preferredPosition, tooltipRef]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setTooltipPosition(INITIAL_POSITION);
      return;
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  return tooltipPosition;
};

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  title,
  content,
  calculation,
  position = 'top'
}) => {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const tooltipPosition = useFloatingTooltipPosition(triggerRef, tooltipRef, isOpen, position);

  const tooltip = isOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="fixed w-72 max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto p-4 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.7)] pointer-events-none ring-1 ring-slate-200 dark:ring-white/10 transition-opacity duration-150"
          style={{
            left: tooltipPosition.left,
            top: tooltipPosition.top,
            zIndex: TOOLTIP_LAYER_Z_INDEX,
            opacity: tooltipPosition.ready ? 1 : 0
          }}
        >
          <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">{title}</p>
          <p className={`text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed ${calculation ? 'mb-3' : ''}`}>{content}</p>
          {calculation && (
            <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter mb-1">Base de Cálculo:</p>
              <p className="text-[10px] text-indigo-600 dark:text-indigo-300/80 font-mono italic">{calculation}</p>
            </div>
          )}
          <span
            aria-hidden="true"
            className={`absolute -translate-x-1/2 border-8 border-transparent ${
              tooltipPosition.placement === 'top'
                ? 'top-full border-t-white dark:border-t-[#0f172a]'
                : 'bottom-full border-b-white dark:border-b-[#0f172a]'
            }`}
            style={{ left: tooltipPosition.arrowLeft }}
          />
        </div>,
        document.body
      )
    : null;

  return (
    <span className="relative inline-block ml-2 align-middle">
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-label={`Mais informações: ${title}`}
        onMouseEnter={() => {
          setIsOpen(true);
        }}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
      >
        <Info size={14} />
      </button>
      {tooltip}
    </span>
  );
};

interface HoverTooltipPortalProps {
  children: React.ReactElement;
  tooltip: React.ReactNode;
  tooltipClassName: string;
  position?: 'top' | 'bottom';
}

export const HoverTooltipPortal: React.FC<HoverTooltipPortalProps> = ({
  children,
  tooltip,
  tooltipClassName,
  position = 'bottom'
}) => {
  const anchorRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const tooltipPosition = useFloatingTooltipPosition(anchorRef, tooltipRef, isOpen, position);
  const child = children as React.ReactElement<any>;
  const clonedChild = React.cloneElement(child, {
    ref: anchorRef,
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      child.props.onMouseEnter?.(event);
      setIsOpen(true);
    },
    onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
      child.props.onMouseLeave?.(event);
      setIsOpen(false);
    }
  });

  const portaledTooltip = isOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className={`fixed max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto pointer-events-none transition-opacity duration-150 ${tooltipClassName}`}
          style={{
            left: tooltipPosition.left,
            top: tooltipPosition.top,
            zIndex: TOOLTIP_LAYER_Z_INDEX,
            opacity: tooltipPosition.ready ? 1 : 0
          }}
        >
          {tooltip}
        </div>,
        document.body
      )
    : null;

  return <>{clonedChild}{portaledTooltip}</>;
};
