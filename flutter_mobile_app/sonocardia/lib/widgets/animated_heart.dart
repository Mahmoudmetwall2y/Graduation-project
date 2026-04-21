import 'package:flutter/material.dart';

// ============================================================
//  AnimatedHeart — Pulses on each detected R-peak
//
//  Trigger a beat via the [beat()] method. The icon scales up
//  and fades back, simulating a real cardiac pulse.
// ============================================================

class AnimatedHeart extends StatefulWidget {
  final double size;
  final Color color;

  const AnimatedHeart({
    super.key,
    this.size = 48,
    this.color = Colors.redAccent,
  });

  @override
  State<AnimatedHeart> createState() => AnimatedHeartState();
}

class AnimatedHeartState extends State<AnimatedHeart>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;
  late final Animation<double> _glow;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _scale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.35), weight: 30),
      TweenSequenceItem(tween: Tween(begin: 1.35, end: 0.95), weight: 30),
      TweenSequenceItem(tween: Tween(begin: 0.95, end: 1.0), weight: 40),
    ]).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));

    _glow = Tween<double>(begin: 0, end: 12).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeOut),
    );
  }

  /// Call this on every detected R-peak to trigger the animation.
  void beat() {
    if (!mounted) return;
    _ctrl.forward(from: 0);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, child) {
        return Transform.scale(
          scale: _scale.value,
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: widget.color.withValues(alpha: 0.5),
                  blurRadius: _glow.value,
                  spreadRadius: _glow.value / 3,
                ),
              ],
            ),
            child: Icon(
              Icons.favorite,
              size: widget.size,
              color: widget.color,
            ),
          ),
        );
      },
    );
  }
}
