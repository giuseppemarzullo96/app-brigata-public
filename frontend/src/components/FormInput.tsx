import { InputHTMLAttributes, LabelHTMLAttributes } from 'react'

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>
}

export const FormInput = ({ label, error, labelProps, className, ...props }: FormInputProps) => {
  return (
    <div className="mb-4 min-w-0">
      <label
        htmlFor={props.id}
        className="block text-sm font-medium text-gray-700 mb-2"
        {...labelProps}
      >
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        className={`input ${error ? 'border-red-500' : ''} ${className || ''}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
}

export const FormTextarea = ({ label, error, className, ...props }: FormTextareaProps) => {
  return (
    <div className="mb-4 min-w-0">
      <label
        htmlFor={props.id}
        className="block text-sm font-medium text-gray-700 mb-2"
      >
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        className={`input ${error ? 'border-red-500' : ''} ${className || ''} min-h-[100px]`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const FormSelect = ({ label, error, options, className, ...props }: FormSelectProps) => {
  return (
    <div className="mb-4 min-w-0">
      <label
        htmlFor={props.id}
        className="block text-sm font-medium text-gray-700 mb-2"
      >
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        className={`input ${error ? 'border-red-500' : ''} ${className || ''}`}
        {...props}
      >
        {props.placeholder && (
          <option value="" disabled>
            {props.placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

