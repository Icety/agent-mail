// Phone (below Tailwind's md) or not, shared by every mail component. Starts as phone on the
// server: mobile first. Copied from Koopa's useViewport; named mail* to avoid auto-import clashes.
const PHONE = '(max-width: 767px)'

const isPhone = ref(true)
let listening = false

export const useMailViewport = () => {
  if (import.meta.client && !listening) {
    listening = true
    const list = window.matchMedia(PHONE)
    isPhone.value = list.matches
    list.addEventListener('change', (e) => { isPhone.value = e.matches })
  }
  return { isPhone: readonly(isPhone) }
}
