import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { dateToPicker, pickerToDate, pickerToTime, timeToPicker } from "../../lib/picker-values";

type Options = {
  mode: "date" | "time";
  /** Current 'YYYY-MM-DD' or 'HH:mm' value; an invalid one opens the picker on `now`. */
  value: string;
  is24Hour: boolean;
  onSelect: (value: string) => void;
  onError: () => void;
};

/** Opens the native Android dialog. Selecting reports the new string value; dismissing changes nothing. */
export function openAndroidPicker({ mode, value, is24Hour, onSelect, onError }: Options): void {
  const now = new Date();
  const initial = mode === "date" ? dateToPicker(value, now) : timeToPicker(value, now);
  DateTimePickerAndroid.open({
    mode,
    value: initial,
    is24Hour,
    onValueChange: (_event, picked) => onSelect(mode === "date" ? pickerToDate(picked) : pickerToTime(picked)),
    onError: () => onError(),
  });
}
