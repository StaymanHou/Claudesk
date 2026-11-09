// Set a form control's value the way a user's typing does, so React's onChange fires.
//
// React tracks the last value it rendered and ignores an `input` event whose value matches it,
// so writing `el.value = v` is invisible to it. Calling the PROTOTYPE's `value` setter bypasses
// React's tracker; the bubbling event then reaches React's root listener.
//
// ⚠️ One live test failed once under full-suite load with "'set value' called on an object that is
// not a valid instance of HTMLInputElement". That is exactly what the input setter throws when
// handed anything that is not an `<input>` (a `<textarea>`, a `<div>`), so the likely cause is a
// query that found the wrong element. Hence the tag is checked FIRST and the error names what
// was found, and the setter matches the tag. It is also taken from the element's own window
// rather than the global prototype, so a control from another document cannot hit the same error.

const CONSTRUCTORS = {
  INPUT: "HTMLInputElement",
  TEXTAREA: "HTMLTextAreaElement",
  SELECT: "HTMLSelectElement",
} as const;

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Set `el`'s value and dispatch the event React listens for: `change` for a `<select>`, `input`
 * otherwise. Call it inside `act(...)`.
 */
export function setNativeValue(el: Element | null, value: string): void {
  if (el === null)
    throw new Error("setNativeValue: no element (the query found nothing)");
  const ctorName = CONSTRUCTORS[el.tagName as keyof typeof CONSTRUCTORS];
  if (ctorName === undefined) {
    throw new Error(
      `setNativeValue: <${el.tagName.toLowerCase()}> is not an input, textarea or select`,
    );
  }
  const view = el.ownerDocument.defaultView as unknown as Record<
    string,
    { prototype: object } | undefined
  > | null;
  const proto = view?.[ctorName]?.prototype;
  const setter = proto && Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter)
    throw new Error(
      `setNativeValue: no value setter on ${ctorName} in this realm`,
    );
  setter.call(el as FormControl, value);
  el.dispatchEvent(
    new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
  );
}
