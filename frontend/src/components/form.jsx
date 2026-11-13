import { useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons'

export const baseField =
  'w-full rounded-lg border bg-ink-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2'
export const fieldClass = (invalid) =>
  `${baseField} ${
    invalid
      ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30'
      : 'border-ink-600 focus:border-accent-500 focus:ring-accent-500/30'
  }`

export function Field({ label, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-300">
      {label}
      {children}
      {error ? (
        <span role="alert" className="text-xs font-normal text-red-400">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs font-normal text-slate-500">{hint}</span>
      )}
    </label>
  )
}

export function PasswordInput({ className, ...rest }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={`${className} pr-10 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-300"
      >
        {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </div>
  )
}
