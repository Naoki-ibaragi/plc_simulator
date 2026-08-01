import React, { useState } from 'react'

const DEVICE_TYPES = ['X','Y','M','D','T'] as const;
type DeviceType = typeof DEVICE_TYPES[number];

function DeviceList(
    {deviceComment, setDeviceComment}:
    {
        deviceComment:{[key:string]:string},
        setDeviceComment:React.Dispatch<React.SetStateAction<{[key:string]:string}>>
    }
) {
  const [selectedType, setSelectedType] = useState<DeviceType>('X');

  const handleCommentChange = (device:string, value:string) => {
    setDeviceComment(prev => ({...prev, [device]: value}));
  };

  const filteredDevices = Object.keys(deviceComment).filter(device => device.startsWith(selectedType));

  return (
    <div className='h-full w-90 shrink-0 flex flex-col border-r border-gray-200 shadow-sm bg-white'>
      <div className='flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2'>
        <label className='text-sm font-medium text-gray-700' htmlFor='device-type-select'>デバイス種別</label>
        <select
          id='device-type-select'
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as DeviceType)}
          className='
            rounded-md
            border
            border-gray-300
            bg-white
            px-2 py-1
            text-sm
            text-gray-900
            shadow-sm
            focus:outline-none
            focus:ring-2
            focus:border-blue-500
            focus:ring-blue-500/20
          '
        >
          {DEVICE_TYPES.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className='overflow-y-auto flex-1'>
        <table className='w-full text-sm text-left'>
          <thead className='sticky top-0 bg-gray-50 text-gray-700'>
            <tr>
              <th className='px-3 py-2 font-medium border-b border-gray-200'>デバイス</th>
              <th className='px-3 py-2 font-medium border-b border-gray-200'>コメント</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map(device => (
              <tr key={device} className='border-b border-gray-100 last:border-b-0'>
                <td className='px-3 py-1.5 text-gray-900 whitespace-nowrap'>{device}</td>
                <td className='px-3 py-1.5'>
                  <input
                    type='text'
                    value={deviceComment[device]}
                    onChange={(e) => handleCommentChange(device, e.target.value)}
                    className='
                      w-full
                      rounded-md
                      border
                      border-gray-300
                      bg-white
                      px-2 py-1
                      text-sm
                      text-gray-900
                      shadow-sm
                      transition
                      focus:outline-none
                      focus:ring-2
                      focus:border-blue-500
                      focus:ring-blue-500/20
                    '
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DeviceList
