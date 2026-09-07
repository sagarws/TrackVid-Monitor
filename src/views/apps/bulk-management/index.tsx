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

// Bulk Management — "apply this setting to a lot of companies at once".
//
// A tab shell from the start even though Automation is the only tab today: the
// per-company settings this control plane owns already come in several
// families, and each will want the same scope-then-apply shape. Adding the
// second tab should be one entry here, not a re-layout of the page.

const TABS = [{ value: 'automation', label: 'Automation', icon: 'tabler-robot' }] as const

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
        </Grid>
      </Grid>
    </TabContext>
  )
}

export default BulkManagement
