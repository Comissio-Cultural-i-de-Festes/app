import { ProfileIcon } from 'app-comi'

/** The profile tab. Colour and size come from the parent's classes. */
export function States() {
  return (
    <div className="flex items-center gap-9">
      <span className="text-fg-dim">
        <ProfileIcon />
      </span>
      <span className="text-brand-icon">
        <ProfileIcon />
      </span>
      <ProfileIcon className="h-[34px] w-[34px] text-fg" />
    </div>
  )
}

/** In its slot, not current. */
export function InATabSlot() {
  return (
    <div className="flex w-[78px] flex-col items-center gap-2">
      <ProfileIcon className="h-[21px] w-[21px] text-fg-dim" />
      <span className="text-3xs leading-none font-medium text-fg-muted-lo">Perfil</span>
    </div>
  )
}
