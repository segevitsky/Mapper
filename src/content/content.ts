// content.ts
let isInspectMode = false;
let hoveredElement: Element | null = null;
let highlighter: HTMLElement | null = null;
// content.ts - נוסיף את הלוגיקה למודל ולאינדיקטורים
let modalContainer: HTMLElement | null = null;
let indicatorsContainer: HTMLElement | null = null;


// אתחול בטעינת הדף
createContainers();

// יצירת מיכל למודל ולאינדיקטורים
function createContainers() {
 // מיכל למודל
 modalContainer = document.createElement('div');
 modalContainer.id = 'api-mapper-modal-container';
 document.body.appendChild(modalContainer);

 // מיכל לאינדיקטורים
 indicatorsContainer = document.createElement('div');
 indicatorsContainer.id = 'api-mapper-indicators-container';
 document.body.appendChild(indicatorsContainer);
}

// הצגת המודל
function showModal(element: Element, position: { top: number, left: number }) {
  console.log({ element });
  console.log({ modalContainer });
 if (!modalContainer) return;

 const modalContent = `
   <div class="fixed inset-0 z-50">
     <div 
       class="absolute bg-white rounded-lg p-6 w-[400px] shadow-xl"
       style="top: ${position.top}px; left: ${position.left}px;"
     >
       <!-- תוכן המודל -->
     </div>
   </div>
 `;

 modalContainer.innerHTML = modalContent;
}

// הוספת אינדיקטור
function addIndicator(elementRect: DOMRect, status: number) {
 if (!indicatorsContainer) return;

 const indicator = document.createElement('div');
 indicator.className = `
   fixed w-4 h-4 rounded-full cursor-pointer
   ${status === 200 ? 'bg-green-500' : 'bg-red-500'}
   hover:scale-110 transition-transform
 `;
 
 indicator.style.top = `${elementRect.top + window.scrollY}px`;
 indicator.style.left = `${elementRect.right + window.scrollX + 5}px`;
 indicator.style.zIndex = '10000';

 indicatorsContainer.appendChild(indicator);
}

// האזנה להודעות מהפאנל
chrome.runtime.onMessage.addListener((message) => {
 console.log('Message received in content:', message);

 switch (message.type) {
   case 'START_INSPECT_MODE':
     enableInspectMode();
     break;

   case 'SHOW_API_MODAL':
     const { element, position } = message.data;
     showModal(element, position);
     break;

   case 'ADD_INDICATOR':
     const { rect, status } = message.data;
     addIndicator(rect, status);
     break;

   case 'CLEAR_INDICATORS':
     if (indicatorsContainer) {
       indicatorsContainer.innerHTML = '';
     }
     break;
 }

 return true;
});



function createHighlighter() {
   highlighter = document.createElement('div');
   highlighter.id = 'element-highlighter';
   highlighter.style.position = 'fixed';
   highlighter.style.border = '2px solid #0088ff';
   highlighter.style.backgroundColor = 'rgba(0, 136, 255, 0.1)';
   highlighter.style.pointerEvents = 'none';
   highlighter.style.zIndex = '10000';
   highlighter.style.display = 'none';
   document.body.appendChild(highlighter);
}

function enableInspectMode() {
   console.log('Inspect mode enabled');
   isInspectMode = true;
   document.body.style.cursor = 'crosshair';
   createHighlighter();
   
   document.addEventListener('mouseover', handleMouseOver);
   document.addEventListener('mouseout', handleMouseOut);
   document.addEventListener('click', handleClick, true);
}

function handleMouseOver(e: MouseEvent) {
   if (!isInspectMode || !highlighter) return;
   
   const target = e.target as Element;
   hoveredElement = target;

   // עדכון המסגרת המודגשת
   const rect = target.getBoundingClientRect();
   highlighter.style.display = 'block';
   highlighter.style.top = `${window.scrollY + rect.top}px`;
   highlighter.style.left = `${window.scrollX + rect.left}px`;
   highlighter.style.width = `${rect.width}px`;
   highlighter.style.height = `${rect.height}px`;
}

function handleMouseOut() {
   if (!isInspectMode || !highlighter) return;
   highlighter.style.display = 'none';
}

function handleClick(e: MouseEvent) {
   if (!isInspectMode) return;
   
   e.preventDefault();
   e.stopPropagation();

   if (hoveredElement) {
       // שליחת מידע על האלמנט שנבחר
       chrome.runtime.sendMessage({
           type: 'ELEMENT_SELECTED',
           data: {
               tagName: hoveredElement.tagName,
               id: hoveredElement.id,
               className: hoveredElement.className,
               path: getElementPath(hoveredElement),
               rect: hoveredElement.getBoundingClientRect()
           }
       });
   }

   disableInspectMode();
}

function disableInspectMode() {
   console.log('Inspect mode disabled');
   isInspectMode = false;
   document.body.style.cursor = 'default';
   document.removeEventListener('mouseover', handleMouseOver);
   document.removeEventListener('mouseout', handleMouseOut);
   document.removeEventListener('click', handleClick, true);
   
   if (highlighter) {
       highlighter.remove();
       highlighter = null;
   }
}

// פונקציה עזר לקבלת נתיב ייחודי לאלמנט
function getElementPath(element: Element): string {
   let path = [];
   let currentElement = element;
   
   while (currentElement.parentElement) {
       let index = 1;
       let sibling = currentElement;
       
       while (sibling.previousElementSibling) {
           if (sibling.previousElementSibling.tagName === currentElement.tagName) {
               index++;
           }
           sibling = sibling.previousElementSibling;
       }
       
       const tagName = currentElement.tagName.toLowerCase();
       const selector = index > 1 ? `${tagName}:nth-of-type(${index})` : tagName;
       path.unshift(selector);
       
       currentElement = currentElement.parentElement;
   }
   
   return path.join(' > ');
}

// האזנה להודעות מהפאנל
chrome.runtime.onMessage.addListener((message) => {
   console.log('Message received:', message);
   if (message.type === 'START_INSPECT_MODE') {
       enableInspectMode();
   } else if (message.type === 'STOP_INSPECT_MODE') {
       disableInspectMode();
   }
   return true;
});

console.log('Content script loaded');