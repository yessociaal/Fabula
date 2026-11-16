import type { AudioChannel } from '@shared/model'
import { Select } from '../../../components/Select'

const CHANNELS: { value: AudioChannel; label: string }[] = [
  { value: 'music', label: 'Music' },
  { value: 'ambient', label: 'Ambient (plays under the music)' }
]

export function ChannelSelect({ value, onChange }: { value: AudioChannel; onChange: (v: AudioChannel) => void }) {
  return <Select<AudioChannel> label="Channel" value={value} options={CHANNELS} onChange={onChange} />
}
