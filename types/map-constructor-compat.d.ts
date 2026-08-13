interface MapConstructor {
  new <K, V>(entries: readonly any[]): Map<K, V>;
}
