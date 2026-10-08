import SwiftUI
import Pow

/// Short, non-spring transitions for state changes that need visual continuity.
enum Motion {
    static let chip = Animation.easeOut(duration: 0.18)
    static let search = Animation.easeInOut(duration: 0.22)
    static let listContent = Animation.easeInOut(duration: 0.22)

    static var softFade: AnyTransition {
        .opacity
    }
}

extension View {
    /// Haptic selection tick when `value` changes.
    func edgeEverSelectionFeedback<V: Equatable>(_ value: V) -> some View {
        changeEffect(.feedbackHapticSelection, value: value)
    }

    /// Soft shine when a boolean toggles true (e.g. pin).
    func edgeEverSuccessShine(trigger: Bool) -> some View {
        changeEffect(.shine, value: trigger, isEnabled: trigger)
    }

    /// Draw attention to an error when it appears.
    func edgeEverErrorShake(on error: String?) -> some View {
        changeEffect(.shake, value: error ?? "", isEnabled: error != nil && !(error?.isEmpty ?? true))
    }
}
