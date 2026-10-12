import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let scrollLockCount = 0;
let previousBodyOverflow = '';
let previousDocumentOverflow = '';

const lockPageScroll = () => {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
};

const unlockPageScroll = () => {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousDocumentOverflow;
  }
};

export const useModalDialog = <T extends HTMLElement>(onRequestClose?: () => void) => {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onRequestClose);

  useEffect(() => {
    closeRef.current = onRequestClose;
  }, [onRequestClose]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const inertedElements: Array<{ element: HTMLElement; wasInert: boolean }> = [];
    lockPageScroll();

    let activeBranch: HTMLElement | null = dialog;
    while (activeBranch?.parentElement) {
      const parent: HTMLElement = activeBranch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling instanceof HTMLElement && sibling !== activeBranch) {
          inertedElements.push({ element: sibling, wasInert: sibling.inert });
          sibling.inert = true;
        }
      }
      activeBranch = parent;
    }

    const focusInitialElement = window.requestAnimationFrame(() => {
      const initial = dialog?.querySelector<HTMLElement>('[data-modal-initial-focus]');
      initial?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (activeIndex === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusInitialElement);
      document.removeEventListener('keydown', handleKeyDown);
      unlockPageScroll();
      for (const { element, wasInert } of inertedElements) element.inert = wasInert;
      previouslyFocused?.focus();
    };
  }, []);

  return dialogRef;
};
