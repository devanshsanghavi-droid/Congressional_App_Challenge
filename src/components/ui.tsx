/**
 * Shared UI primitives.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Deliberately few. Enough to keep four screens consistent without becoming a
 * component library nobody asked for — every one of these exists because it is
 * used on at least two screens, or because it encodes an accessibility rule
 * that should not be re-derived per screen.
 */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

/** A screen: safe area, page background, and a scroll region. */
export function Screen({
  children,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Pinned to the bottom — primary actions belong in thumb reach. */
  footer?: ReactNode;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.scrollContent}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      {body}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  const isDisabled = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy }}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      style={({ pressed }) => [
        styles.button,
        variantStyles[variant].container,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {busy ? <ActivityIndicator color={variantStyles[variant].label.color} /> : null}
      <Text style={[styles.buttonLabel, variantStyles[variant].label]} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

/** A titled block. The four Notice Detail sections are these. */
export function Section({
  title,
  children,
  accessory,
}: {
  title: string;
  children: ReactNode;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {accessory}
      </View>
      {children}
    </View>
  );
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

/** Provenance, sourcing and disclaimers. Never load-bearing. */
export function Caption({ children }: { children: ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

/**
 * An empty state that says what to do, not that something is missing.
 *
 * SPEC §7: every screen has a real empty state. "No notices" is a fact about
 * the database; "take a photo of a letter and Carta will remind you" is a fact
 * about what to do next, and it is the only thing on an empty Home screen so it
 * had better be the second one.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

/** A failure the user can act on. Never a stack trace. */
export function ErrorState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorBody}>{body}</Text>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  scrollContent: { padding: space.lg, gap: space.lg, flexGrow: 1 },
  footer: {
    padding: space.lg,
    paddingTop: space.md,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    backgroundColor: color.surface,
  },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
    gap: space.sm,
  },
  cardPressed: { backgroundColor: color.accentSoft },

  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { ...type.bodyStrong, textAlign: 'center' },

  section: { gap: space.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  sectionTitle: { ...type.heading, color: color.text, flexShrink: 1 },

  body: { ...type.body, color: color.text, lineHeight: 25 },
  muted: { ...type.body, color: color.textMuted, lineHeight: 24 },
  caption: { ...type.caption, color: color.textFaint, lineHeight: 18 },

  empty: { gap: space.md, paddingVertical: space.xxxl, alignItems: 'flex-start' },
  emptyTitle: { ...type.title, color: color.text },
  emptyBody: { ...type.body, color: color.textMuted, lineHeight: 25 },

  error: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.redSoft,
    borderWidth: 1,
    borderColor: color.red,
  },
  errorTitle: { ...type.subheading, color: color.red },
  errorBody: { ...type.body, color: color.text, lineHeight: 24 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.border },
});

const variantStyles: Record<ButtonVariant, { container: ViewStyle; label: TextStyle }> = {
  primary: {
    container: { backgroundColor: color.accent },
    label: { color: color.accentText },
  },
  secondary: {
    container: {
      backgroundColor: color.surface,
      borderWidth: 1,
      borderColor: color.borderStrong,
    },
    label: { color: color.text },
  },
  quiet: { container: { backgroundColor: 'transparent' }, label: { color: color.accent } },
  danger: {
    container: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.red },
    label: { color: color.red },
  },
};
