# Dayform — mobile design direction

Reference: attached iPhone planner screenshot. Translate its airy week strip, softly tinted activity cards, and vertical day schedule into a functional native UI, not its decorative device frame.

- Mood: calm, optimistic productivity. Warm off-white canvas (#F8F9FB), white raised surfaces, ink (#20263D), muted slate (#8B94A8), periwinkle (#6868EC) primary. Pale blue/lilac/peach/mint task tints by category. Coral for warnings/destructive actions.
- Typography: platform system sans (SF Pro on iOS), explicitly set on principal text; rounded/system display for greeting and metrics. 31px bold greeting, 22px section titles, 15–16px task titles, 11–13px metadata.
- Spacing: 24px horizontal gutters, 8px rhythm, 18–24px gaps. Seven equal week cells; selected day is violet-filled, today separately marked with a dot.
- Components: lightly elevated white panels with 22–28px radii; tinted timeline blocks with 4px category accent edge and category icon, clear duration/time labels. Hairline grid, not heavy boxes.
- Layout: scrollable mobile-first dashboard. Greeting and week selector above a white daily panel. Inside, a slim left time rail and proportional event blocks. Backlog preview below. Violet add button above a two-tab bottom navigator. Tasks tab shows backlog and scheduled items.
- Timeline: 06:00–22:00, 64px/hour. Tapping an empty hour opens editor at that time. Blocks scale with duration; overlapping intervals render side by side with an explicit warning. Outside-hours list preserves visibility of out-of-range tasks.
- Interactions: immediate local updates, explicit edit/schedule modal, conflict warning with override, confirmation before delete, full touch targets, accessible labels. Reduced-motion friendly.
- Data: local wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`) with duration in integer minutes. AsyncStorage persists on one device. No account/backend in MVP.
- Localization: EN / VI segmented switch on both main screen headers; per-device preference saved in AsyncStorage. Translate interface labels, accessible names, date/time, duration, and validation; never alter user-entered task titles/notes or stored category identifiers.