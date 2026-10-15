package com.snapmark;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.Collections;
import java.util.List;

/** Listed in PluginConfig.json's reactPackages by buildPlugin.sh (it scans MainApplication). */
public class SnapMarkPackage implements ReactPackage {
    @NonNull
    @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext context) {
        return Collections.singletonList(new SnapMarkNativeModule(context));
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext context) {
        return Collections.emptyList();
    }
}
