import { useCallback, useEffect, useRef, type RefObject } from "react";
import { TextInput, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, type View } from "react-native";
import { nextScrollY, revealDelta, type KeyboardState } from "../lib/keyboard-inset";

const REVEAL_MARGIN = 16;
/** The keyboard padding must be laid out before the scroll, or the scroll is clamped to the old content height. */
const REVEAL_DELAY_MS = 80;

type Result = {
  /** Scrolls the focused text input into the part of the viewport the keyboard leaves free. No-op while the keyboard is hidden. */
  reveal: () => void;
  /** Pass to the ScrollView's `onScroll` (with `scrollEventThrottle`) so the current offset is known. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

/**
 * Keeps the focused TextInput of a form visible above the keyboard. `viewportRef` is a View with exactly the
 * scroll view's bounds (a ScrollView ref cannot be measured in window coordinates).
 */
export function useRevealFocusedInput(scrollRef: RefObject<ScrollView | null>, viewportRef: RefObject<View | null>, keyboard: KeyboardState): Result {
  const scrollY = useRef(0);
  const keyboardRef = useRef(keyboard);
  useEffect(() => { keyboardRef.current = keyboard; }, [keyboard]);

  const reveal = useCallback(() => {
    const keyboardTop = keyboardRef.current.top;
    const input = TextInput.State.currentlyFocusedInput();
    const viewport = viewportRef.current;
    if (keyboardTop === null || !input || !viewport) return;
    viewport.measureInWindow((_x, viewportTop, _width, viewportHeight) => {
      input.measureInWindow((_inputX, fieldTop, _inputWidth, fieldHeight) => {
        const delta = revealDelta({ fieldTop, fieldBottom: fieldTop + fieldHeight, viewportTop, visibleBottom: Math.min(viewportTop + viewportHeight, keyboardTop), margin: REVEAL_MARGIN });
        if (delta !== 0) scrollRef.current?.scrollTo({ y: nextScrollY(scrollY.current, delta), animated: true });
      });
    });
  }, [scrollRef, viewportRef]);

  // The keyboard just opened (or changed height): wait for the padding to apply, then reveal.
  useEffect(() => {
    if (keyboard.top === null) return;
    const timer = setTimeout(reveal, REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [keyboard.top, reveal]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = event.nativeEvent.contentOffset.y; }, []);
  return { reveal, onScroll };
}
