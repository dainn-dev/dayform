import { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform } from "react-native";
import { HIDDEN_KEYBOARD, keyboardFromMetrics, type KeyboardState } from "../lib/keyboard-inset";

/**
 * Height and top edge of the on-screen keyboard (hidden: `{ height: 0, top: null }`).
 * Needed inside a transparent-bars `Modal` on Android, where the window is not resized for the keyboard and
 * `KeyboardAvoidingView` with `behavior={undefined}` does nothing. Listeners are removed on unmount.
 */
export function useKeyboardInset(): KeyboardState {
  const [keyboard, setKeyboard] = useState<KeyboardState>(HIDDEN_KEYBOARD);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const update = (next: KeyboardState) => setKeyboard(current => current.height === next.height && current.top === next.top ? current : next);
    const show = Keyboard.addListener(ios ? "keyboardWillChangeFrame" : "keyboardDidShow", event => {
      update(keyboardFromMetrics(event.endCoordinates, Dimensions.get("window").height));
    });
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => update(HIDDEN_KEYBOARD));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return keyboard;
}
