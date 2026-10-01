plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val scannerKeystorePath = System.getenv("SCANNER_KEYSTORE_PATH")
val scannerKeystorePassword = System.getenv("SCANNER_KEYSTORE_PASSWORD")
val scannerSigningConfigured = !scannerKeystorePath.isNullOrBlank() && !scannerKeystorePassword.isNullOrBlank()
if (gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }) {
    check(scannerSigningConfigured) { "Release builds require the fixed scanner signing keystore; never publish a debug-signed APK." }
}

android {
    namespace = "jp.stepkobetsu.pastexamscanner"
    compileSdk = 35

    defaultConfig {
        applicationId = "jp.stepkobetsu.pastexamscanner"
        minSdk = 23
        targetSdk = 35
        versionCode = 9
        versionName = "0.2.4"
    }

    signingConfigs {
        if (scannerSigningConfigured) {
            create("scannerRelease") {
                storeFile = file(requireNotNull(scannerKeystorePath))
                storePassword = scannerKeystorePassword
                keyAlias = "step-scanner"
                keyPassword = scannerKeystorePassword
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            if (scannerSigningConfigured) signingConfig = signingConfigs.getByName("scannerRelease")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    implementation("com.google.android.gms:play-services-mlkit-document-scanner:16.0.0")
}
