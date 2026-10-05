import type { Section } from '../sections'

export default function SectionPage({ section }: { section: Section }) {
  return (
    <>
      <h1>
        {section.icon} {section.label}
      </h1>
      <p className="muted">{section.description}</p>
      <div className="card placeholder">
        <strong>Próximamente</strong>
        <ul>
          {section.coming.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </>
  )
}
