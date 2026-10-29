import React, { useMemo } from "react";
import { Text, type TextProps } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { splitHighlight } from "../../lib/search";

type Props = TextProps & { text: string; query: string };

/** Renders `text` with the parts matched by `query` (accent-insensitive) tinted. Plain text when `query` is empty. */
export function HighlightedText({ text, query, style, ...rest }: Props) {
  const colors = useColors();
  const segments = useMemo(() => splitHighlight(text, query), [text, query]);
  const matchStyle = { backgroundColor: colors.primaryTint, color: colors.primary };
  return <Text style={style} {...rest}>
    {segments.map((segment, index) => segment.highlighted
      ? <Text key={index} style={matchStyle}>{segment.text}</Text>
      : segment.text)}
  </Text>;
}
