import { useEffect, useRef, type ReactNode } from "react";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

// Transform-only feedback keeps the surrounding card and controls in place.
export function ActionPulse({
  value,
  children,
}: {
  value: string | boolean;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const previous = useRef(value);
  useEffect(() => {
    const changed = previous.current !== value;
    previous.current = value;
    if (reducedMotion) {
      cancelAnimation(scale);
      scale.value = 1;
    } else if (changed) {
      scale.value = withSequence(
        withTiming(1.1, { duration: 80 }),
        withSpring(1, { damping: 16, stiffness: 260 }),
      );
    }
    return () => cancelAnimation(scale);
  }, [value, reducedMotion, scale]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
