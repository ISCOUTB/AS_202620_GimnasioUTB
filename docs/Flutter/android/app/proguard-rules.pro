# Reglas de R8 para la APK de release.
# El plugin de Flutter y los plugins (mobile_scanner, etc.) ya aportan sus
# propias reglas de conservación; aquí solo van los ajustes del proyecto.

# Flutter referencia clases de Play Core (componentes diferidos) que esta app
# no incluye. Sin esta línea R8 falla con "Missing class com.google.android.play.core".
-dontwarn com.google.android.play.core.**

# mobile_scanner usa ML Kit para leer el QR; se conservan sus clases para que
# la ofuscación no rompa el escáner del encargado.
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**
