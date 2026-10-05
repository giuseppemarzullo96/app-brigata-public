import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

const TurniCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date())

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const { data } = useQuery({
    queryKey: ['turni', 'calendar', format(currentDate, 'yyyy-MM')],
    queryFn: async () => {
      const response = await api.get('/turni', {
        params: {
          dataInizio: format(monthStart, 'yyyy-MM-dd'),
          dataFine: format(monthEnd, 'yyyy-MM-dd'),
        },
      })
      return response.data
    },
  })

  const turni = data?.turni || []

  const getTurniForDay = (day: Date) => {
    return turni.filter((turno: any) => isSameDay(new Date(turno.data_turno), day))
  }

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Calendario Turni</h1>
        <Link to="/turni" className="btn btn-secondary">
          Vista Lista
        </Link>
      </div>

      <div className="card">
        {/* Header Calendario */}
        <div className="flex items-center justify-between mb-6">
          <button type="button" onClick={prevMonth} aria-label="Mese precedente" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-semibold">
            {format(currentDate, 'MMMM yyyy', { locale: it })}
          </h2>
          <button type="button" onClick={nextMonth} aria-label="Mese successivo" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-gray-100">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Nomi Giorni */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {dayNames.map((day) => (
            <div key={day} className="text-center text-sm font-semibold text-gray-600 p-2">
              {day}
            </div>
          ))}
        </div>

        {/* Giorni del Mese */}
        <div className="grid grid-cols-7 gap-2">
          {/* Spazi vuoti per giorni del mese precedente */}
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {/* Giorni del mese */}
          {daysInMonth.map((day) => {
            const dayTurni = getTurniForDay(day)
            const isToday = isSameDay(day, new Date())

            return (
              <div
                key={day.toISOString()}
                className={`aspect-square border rounded-lg p-2 ${
                  isToday ? 'bg-primary-50 border-primary-500' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${isToday ? 'text-primary-700' : 'text-gray-700'}`}>
                    {format(day, 'd')}
                  </span>
                </div>
                <div className="space-y-1">
                  {dayTurni.slice(0, 2).map((turno: any) => (
                    <Link
                      key={turno.id}
                      to={`/turni/${turno.id}`}
                      className="block text-xs p-1 bg-primary-50 text-primary-800 rounded hover:bg-primary-100 truncate"
                      title={turno.tipo_turno}
                    >
                      {turno.tipo_turno}
                    </Link>
                  ))}
                  {dayTurni.length > 2 && (
                    <span className="text-xs text-gray-500">+{dayTurni.length - 2}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TurniCalendar

