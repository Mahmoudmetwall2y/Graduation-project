import 'package:flutter/material.dart';

// ============================================================
//  VitalTile — Compact stat display card
//
//  Used for showing BPM, HRV, signal quality, etc.
// ============================================================

class VitalTile extends StatelessWidget {
  final String label;
  final String value;
  final String? unit;
  final IconData icon;
  final Color color;
  final String? subtitle;

  const VitalTile({
    super.key,
    required this.label,
    required this.value,
    this.unit,
    required this.icon,
    this.color = Colors.white,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
              ),
              if (unit != null)
                Padding(
                  padding: const EdgeInsets.only(left: 2, bottom: 2),
                  child: Text(
                    unit!,
                    style: TextStyle(
                      fontSize: 11,
                      color: color.withValues(alpha: 0.7),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: color.withValues(alpha: 0.7),
              fontWeight: FontWeight.w500,
            ),
          ),
          if (subtitle != null)
            Text(
              subtitle!,
              style: TextStyle(
                fontSize: 9,
                color: color.withValues(alpha: 0.5),
              ),
            ),
        ],
      ),
    );
  }
}
