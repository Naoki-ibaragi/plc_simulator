import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

function PageLayout({ title, children }: { title: string, children: ReactNode }) {
  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='mx-auto max-w-3xl px-6 py-12 sm:px-8'>
        <h1 className='mb-8 border-b-2 border-blue-500 pb-3 text-2xl font-bold text-gray-900'>
          {title}
        </h1>
        <div className='space-y-6 text-base leading-loose text-gray-700'>
          {children}
        </div>
      </div>
    </div>
  )
}

export function NextLink({ to, children }: { to: string, children: ReactNode }) {
  return (
    <div className='pt-4'>
      <Link
        to={to}
        className='inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md'
      >
        {children}
        <span aria-hidden>→</span>
      </Link>
    </div>
  )
}

export function FigureImage({ src, alt }: { src: string, alt: string }) {
  return (
    <img
      className='mx-auto w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-sm'
      src={src}
      alt={alt}
    />
  )
}

export function FigurePlaceholder({ label }: { label: string }) {
  return (
    <div className='mx-auto flex h-40 w-full max-w-md items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white text-sm text-gray-400'>
      {label}(準備中)
    </div>
  )
}

export function MathBlock({ children }: { children: ReactNode }) {
  return (
    <div className='overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 text-center text-lg shadow-sm'>
      {children}
    </div>
  )
}

export default PageLayout
