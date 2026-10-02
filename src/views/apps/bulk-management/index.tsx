'use client'

// React Imports
import { useState } from 'react'
import type { SyntheticEvent } from 'react'

// MUI Imports
import Grid from '@mui/material/Grid'
import Tab from '@mui/material/Tab'
import TabContext from '@mui/lab/TabContext'
import TabPanel from '@mui/lab/TabPanel'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTabList from '@core/components/mui/TabList'
import AutomationTab from './AutomationTab'
import DesktopAppTab from './DesktopAppTab'

// Bulk Management — "apply this setting to a lot of companies at once".
//
// A tab per family of settings: they all want the same scope-then-apply shape,
// but "where does this automation run" and "has this company accepted the
// desktop app's notice" are different questions and reading them in one list
// would flatten that. Adding the next family is one entry here.

const TABS = [
  { value: 'automation', label: 'Automation', icon: 'tabler-robot' },
  { value: 'desktop-app', label: 'Desktop App', icon: 'tabler-device-desktop' }
] as const

const BulkManagement = () => {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].value)

  const handleChange = (_event: SyntheticEvent, value: string) => setActiveTab(value)

  return (
    <TabContext value={activeTab}>
      <Grid container spacing={6}>
        <Grid size={{ xs: 12 }}>
          <Typography variant='h4'>Bulk Management</Typography>
          <Typography color='text.secondary'>Apply a setting across many companies in one write</Typography>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <CustomTabList onChange={handleChange} variant='scrollable' pill='true'>
            {TABS.map(tab => (
              <Tab
                key={tab.value}
                value={tab.value}
                label={tab.label}
                icon={<i className={tab.icon} />}
                iconPosition='start'
              />
            ))}
          </CustomTabList>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TabPanel value='automation' className='p-0'>
            <AutomationTab />
          </TabPanel>
          <TabPanel value='desktop-app' className='p-0'>
            <DesktopAppTab />
          </TabPanel>
        </Grid>
      </Grid>
    </TabContext>
  )
}

export default BulkManagement
