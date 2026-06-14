/* Globala keyframes – injiceras en gång. Inline-stilarna i övrigt
   kan inte uttrycka @keyframes, så vi lägger dem här. */

const CSS = `
@keyframes fi-toast-in {
  from { transform: translateX(115%); opacity: 0; }
  to   { transform: translateX(0);     opacity: 1; }
}
@keyframes fi-modal-pop {
  from { transform: scale(0.92); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
@keyframes fi-overlay-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes fi-month-pulse {
  0%   { opacity: 0; }
  30%  { opacity: 0.5; }
  100% { opacity: 0; }
}
@keyframes fi-badge-pop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}
`;

export function Animations() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
