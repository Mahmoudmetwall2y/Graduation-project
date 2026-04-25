// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';

import 'package:sonocardia/main.dart';

void main() {
  testWidgets('App renders monitor screen', (WidgetTester tester) async {
    await tester.pumpWidget(const SonocardiaApp());

    // Verify the app title and key UI elements are present
    expect(find.text('Sonocardia'), findsOneWidget);
    expect(find.text('Connect'), findsOneWidget);
    expect(find.text('ECG Signal'), findsOneWidget);
    expect(find.text('Heart Sound Volume (PCG)'), findsOneWidget);
  });
}
