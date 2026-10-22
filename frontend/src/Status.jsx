export function Status({ state }) {
  return (
    <span className={`status ${state}`}>
      <i />
      {state || "unresolved"}
    </span>
  );
}
