import React from "react";
import { View, Text, Platform } from "react-native";

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: "#050509", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>ScanKey WEB OK</Text>
      <Text style={{ color: "#888CA3", marginTop: 8 }}>Platform: {Platform.OS}</Text>
      <Text style={{ color: "#888CA3", marginTop: 8 }}>Build: {new Date().toISOString()}</Text>
    </View>
  );
}
