'use client';

import { useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@trading-game/design-intelligence-layer';

export interface GameInfoSection {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface GameInfoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  sections: GameInfoSection[];
}

export function GameInfoDrawer({
  open,
  onOpenChange,
  title = 'Game info',
  sections,
}: GameInfoDrawerProps) {
  const [activeTab, setActiveTab] = useState(sections[0]?.id ?? '');

  if (!sections.length) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-safe overflow-y-auto flex-1 min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full mb-4">
              {sections.map((section) => (
                <TabsTrigger key={section.id} value={section.id} className="flex-1 text-xs">
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {sections.map((section) => (
              <TabsContent key={section.id} value={section.id} className="mt-0 pb-4">
                {section.content}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
